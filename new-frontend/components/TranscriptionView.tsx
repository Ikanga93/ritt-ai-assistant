import useCombinedTranscriptions from "@/hooks/useCombinedTranscriptions";
import * as React from "react";
import { hasPaymentMarker, extractPaymentInfo, splitMessageAtPaymentMarker } from "@/utils/paymentMarkerUtils";
import PaymentButton from "./PaymentButton";
import { handlePaymentButtonClick } from "@/services/paymentService";

export default function TranscriptionView() {
  const combinedTranscriptions = useCombinedTranscriptions();

  // scroll to bottom when new transcription is added
  React.useEffect(() => {
    const transcription = combinedTranscriptions[combinedTranscriptions.length - 1];
    if (transcription) {
      const transcriptionElement = document.getElementById(transcription.id);
      if (transcriptionElement) {
        transcriptionElement.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [combinedTranscriptions]);

  /**
   * Renders a message with payment button if it contains a payment marker
   * @param text The message text
   * @returns JSX elements for the message with payment button if applicable
   */
  const renderMessageWithPaymentButton = (text: string) => {
    // If the message doesn't contain a payment marker, just return the text
    if (!hasPaymentMarker(text)) {
      return <>{text}</>;
    }

    // Extract payment information from the message
    const paymentInfo = extractPaymentInfo(text);
    if (!paymentInfo) {
      return <>{text}</>;
    }

    // Split the message into parts before and after the payment marker
    const messageParts = splitMessageAtPaymentMarker(text);

    // Render the message with a payment button
    return (
      <>
        {messageParts[0]}
        <div className="my-2">
          <PaymentButton
            orderId={paymentInfo.orderId}
            amount={paymentInfo.amount}
            onClick={() => handlePaymentButtonClick(paymentInfo.orderId, paymentInfo.amount)}
          />
        </div>
        {messageParts[1]}
      </>
    );
  };

  return (
    <div className="h-full flex flex-col gap-2 overflow-y-auto">
      {combinedTranscriptions.map((segment) => (
        <div
          id={segment.id}
          key={segment.id}
          className={
            segment.role === "assistant"
              ? "p-2 self-start fit-content max-w-[80%]"
              : "bg-gray-800 rounded-md p-2 self-end fit-content max-w-[80%]"
          }
        >
          {renderMessageWithPaymentButton(segment.text)}
        </div>
      ))}
    </div>
  );
}
