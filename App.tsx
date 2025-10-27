import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import AlertModal from './components/AlertModal';
import { encode } from './utils/audioUtils';
import AudioVisualizer from './components/AudioVisualizer';

const TRIGGER_WORD = '_squat_'; // A unique, unmistakable trigger word.

// Per Gemini docs, create a blob from audio data.
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    // The supported audio MIME type is 'audio/pcm'.
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Plays a short, pleasant alert sound using the Web Audio API.
 */
const playAlertSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return; // Web Audio API not supported

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure the oscillator for a beep sound
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note, a clear beep

    // Configure the gain to create a short fade-out effect
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // Start at half volume
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);

    // Play the sound for a short duration
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);

    // Clean up the audio context after the sound has finished playing
    setTimeout(() => {
        audioContext.close();
    }, 500);
};


const App: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [squatCount, setSquatCount] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  
  const currentInputTranscriptionRef = useRef('');

  const visualize = () => {
    if (!analyserRef.current) {
      return;
    }
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    let sumSquares = 0.0;
    for (const amplitude of dataArray) {
      // Convert from byte value (0-255) to float (-1 to 1)
      const normalizedAmplitude = (amplitude / 128.0) - 1.0;
      sumSquares += normalizedAmplitude * normalizedAmplitude;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    setAudioLevel(rms);

    animationFrameIdRef.current = requestAnimationFrame(visualize);
  };

  const stopListening = () => {
    if (!sessionPromiseRef.current) return;

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

    if (scriptProcessorRef.current && mediaStreamSourceRef.current && audioContextRef.current) {
        mediaStreamSourceRef.current.disconnect();
        scriptProcessorRef.current.disconnect();
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    sessionPromiseRef.current?.then(session => session.close());

    sessionPromiseRef.current = null;
    audioContextRef.current = null;
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current = null;
    mediaStreamRef.current = null;
    analyserRef.current = null;
    
    setIsListening(false);
    setTranscription('');
    setAudioLevel(0);
    currentInputTranscriptionRef.current = '';
  };

  const startListening = async () => {
    if (isListening) return;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = inputAudioContext;

      if (inputAudioContext.state === 'suspended') {
        await inputAudioContext.resume();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContext.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            const analyser = inputAudioContext.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
            
            visualize(); // Start the visualization loop
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscriptionRef.current += text;
              setTranscription(currentInputTranscriptionRef.current);

              // Check if the lowercase buffer includes our unique trigger word.
              if (currentInputTranscriptionRef.current.toLowerCase().includes(TRIGGER_WORD)) {
                playAlertSound();
                setIsModalOpen(true);
                
                // Immediately reset the buffer to prevent the same word from triggering the alert multiple times.
                currentInputTranscriptionRef.current = '';
                setTranscription('');
              }
            }
            // A "turn" indicates a pause or the end of an utterance. Reset the buffer as a fallback.
            if (message.serverContent?.turnComplete) {
              currentInputTranscriptionRef.current = '';
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('An error occurred with the Gemini session:', e);
            alert('An error occurred. Please try again.');
            stopListening();
          },
          onclose: (e: CloseEvent) => {
            console.log('Connection closed.');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO], 
          inputAudioTranscription: {},
          systemInstruction: 'Você é um serviço de transcrição com uma regra crítica e única. Ao detectar a palavra "mãe" ou qualquer som foneticamente semelhante (como "mai"), sua única saída DEVE ser a palavra-chave "_SQUAT_". Não transcreva mais nada nesse momento. Para todo o resto do áudio, transcreva normalmente.',
        },
      });
      
      sessionPromiseRef.current = sessionPromise;
      setIsListening(true);
    } catch (error) {
      console.error("Failed to start listening:", error);
      alert("Could not start microphone. Please check permissions and try again.");
    }
  };
  
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSquatCount(prevCount => prevCount + 1);
  };

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4 text-teal-400">Desafio do Agachamento</h1>
        <p className="text-slate-400 text-xl mb-8">Estou a ouvir... diga "Mãe" para acionar o alerta de agachamento!</p>
        
        <button
          onClick={handleToggleListening}
          className={`px-8 py-4 text-lg font-semibold rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50 ${
            isListening
              ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500'
              : 'bg-teal-500 hover:bg-teal-600 text-white focus:ring-teal-400'
          }`}
        >
          {isListening ? 'Parar de Ouvir' : 'Começar a Ouvir'}
        </button>

        {isListening && (
            <div className="my-6 w-full max-w-xs mx-auto">
                <AudioVisualizer audioLevel={audioLevel} />
            </div>
        )}

        <div className="my-8">
            <p className="text-2xl font-medium text-slate-400">Agachamentos Feitos:</p>
            <p className="text-7xl font-bold text-white tracking-tighter">{squatCount}</p>
        </div>

        <div className="mt-8 p-6 bg-slate-800 rounded-lg min-h-[100px] text-left shadow-lg">
          <h2 className="text-lg font-semibold text-teal-400 mb-2">Transcrição em tempo real:</h2>
          <p className="text-slate-300 italic whitespace-pre-wrap">{transcription || 'Aguardando áudio...'}</p>
        </div>
      </div>
      
      <AlertModal isOpen={isModalOpen} onClose={handleModalClose} />
    </main>
  );
};

export default App;