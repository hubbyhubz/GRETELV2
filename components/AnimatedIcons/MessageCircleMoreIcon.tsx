import React from "react";
import { MessageCircleMore } from "lucide-react";

type MessageCircleMoreIconProps = React.ComponentProps<typeof MessageCircleMore> & {
  size?: number;
  isHovered?: boolean;
};

export function MessageCircleMoreIcon({ size = 24, isHovered: _isHovered, ...props }: MessageCircleMoreIconProps) {
  return <MessageCircleMore size={size} {...props} />;
}
