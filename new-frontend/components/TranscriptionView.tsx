import useCombinedTranscriptions from "@/hooks/useCombinedTranscriptions";
import * as React from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";

export default function TranscriptionView() {
  const combinedTranscriptions = useCombinedTranscriptions();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  React.useEffect(() => {
    const transcription = combinedTranscriptions[combinedTranscriptions.length - 1];
    if (transcription) {
      const transcriptionElement = document.getElementById(transcription.id);
      if (transcriptionElement) {
        transcriptionElement.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [combinedTranscriptions]);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {combinedTranscriptions.map((transcription) => {
        const isFromServer = transcription.from !== localParticipant?.identity;
        return (
          <div
            key={transcription.id}
            id={transcription.id}
            className={`flex ${isFromServer ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`rounded-lg p-3 max-w-[80%] ${isFromServer
                ? "bg-gray-200 text-black"
                : "bg-blue-500 text-white"
                }`}
            >
              {transcription.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
