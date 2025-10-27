import React from 'react';

interface AudioVisualizerProps {
  audioLevel: number; // A value from 0 to 1 representing RMS volume
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioLevel }) => {
  // Scale the audio level (typically 0-0.15 for RMS) to a more visible 0-100% height
  const barHeight = Math.max(0, Math.min(100, audioLevel * 500)); 

  return (
    <div 
        className="w-full h-12 bg-slate-800/50 rounded-lg flex items-center justify-center p-2 border border-slate-700"
        title={`Nível de áudio: ${Math.round(barHeight)}%`}
    >
      <div 
        className="w-full bg-teal-400 rounded-sm transition-all duration-75 ease-out"
        style={{ height: `${barHeight}%` }}
        aria-label={`Nível de áudio: ${Math.round(barHeight)}%`}
        role="progressbar"
        aria-valuenow={barHeight}
        aria-valuemin={0}
        aria-valuemax={100}
      ></div>
    </div>
  );
};

export default AudioVisualizer;
