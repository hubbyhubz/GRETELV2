import React from "react";
import { Image } from "lucide-react";

type ImageIconProps = React.ComponentProps<typeof Image> & { size?: number };

export function ImageIcon({ size = 24, ...props }: ImageIconProps) {
  return <Image size={size} {...props} />;
}

