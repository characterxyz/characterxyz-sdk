/** Inline icons (24×24, stroke = currentColor), so the widget loads no assets. */
import type { ComponentChildren } from 'preact';

type P = { size?: number };

const svg = (size: number, children: ComponentChildren) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const ChatIcon = ({ size = 20 }: P) => svg(size, <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6a.5.5 0 0 1-.8-.4V16h0A2.5 2.5 0 0 1 4 13.5z" />);
export const PhoneIcon = ({ size = 20 }: P) =>
  svg(size, <path d="M5.2 3.5h3l1.6 4.2-2 1.4a12 12 0 0 0 7.1 7.1l1.4-2 4.2 1.6v3a1.7 1.7 0 0 1-1.8 1.7A16.6 16.6 0 0 1 3.5 5.3 1.7 1.7 0 0 1 5.2 3.5z" />);
export const HangUpIcon = ({ size = 22 }: P) =>
  svg(size, <path d="M3 13.6c5-4.4 13-4.4 18 0l-1.7 2.6-3.6-1.3v-2.6a11 11 0 0 0-7.4 0v2.6l-3.6 1.3z" />);
export const MicIcon = ({ size = 20 }: P) =>
  svg(
    size,
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>,
  );
export const MicOffIcon = ({ size = 20 }: P) =>
  svg(
    size,
    <>
      <path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.4V6a3 3 0 0 0-5.7-1.3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.6 5M18.4 12.5a6.5 6.5 0 0 0 .1-1.5M12 17.5V21M3 3l18 18" />
    </>,
  );
export const CloseIcon = ({ size = 18 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);
export const SendIcon = ({ size = 18 }: P) => svg(size, <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />);
export const BackIcon = ({ size = 18 }: P) => svg(size, <path d="M15 5l-7 7 7 7" />);
export const SparkIcon = ({ size = 14 }: P) => svg(size, <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />);
export const NewChatIcon = ({ size = 18 }: P) => svg(size, <path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z" />);
export const CheckIcon = ({ size = 14 }: P) => svg(size, <path d="M5 12.5l4.2 4.2L19 7" />);
export const RetryIcon = ({ size = 14 }: P) => svg(size, <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />);
