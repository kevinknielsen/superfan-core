import React, { createContext, useContext, useState, ReactNode } from "react";

interface AudioPlayerContextType {
  currentPlayingId: string | null;
  setCurrentPlayingId: (id: string | null) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(
  undefined,
);

export const useAudioPlayerContext = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error(
      "useAudioPlayerContext must be used within an AudioPlayerProvider",
    );
  }
  return context;
};

export const AudioPlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

  return (
    <AudioPlayerContext.Provider
      value={{ currentPlayingId, setCurrentPlayingId }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
};
