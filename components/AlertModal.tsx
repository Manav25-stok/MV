
import React from 'react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AlertModal: React.FC<AlertModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 rounded-2xl p-8 shadow-2xl text-center max-w-sm w-full mx-4 transform transition-all scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-bold text-teal-400 mb-4">Você disse "Mãe"!</h2>
        <p className="text-slate-300 mb-6 text-lg">É hora de fazer um agachamento e fortalecer as pernas!</p>
        <img
          src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2RtaXJ6NGlhcWR4ZXIzMnhicm43eTd6bW5oaWhsZmN5MnJ1bjZkNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3V024sVIqI1YtP44/giphy.gif"
          alt="Pessoa fazendo agachamento"
          className="rounded-lg mb-6 w-full object-cover h-48"
        />
        <button
          onClick={onClose}
          className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-75"
        >
          Feito!
        </button>
      </div>
    </div>
  );
};

export default AlertModal;
