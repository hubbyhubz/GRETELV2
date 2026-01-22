import React from "react";
import { MessageCircleMore } from "lucide-react";

type MessageCircleMoreIconProps = React.ComponentProps<typeof MessageCircleMore> & { size?: number };

export function MessageCircleMoreIcon({ size = 24, ...props }: MessageCircleMoreIconProps) {
  return <MessageCircleMore size={size} {...props} />;
}

