import React from "react";
import { GripHorizontal } from "lucide-react";

type GripHorizontalIconProps = React.ComponentProps<typeof GripHorizontal> & { size?: number };

export function GripHorizontalIcon({ size = 24, ...props }: GripHorizontalIconProps) {
  return <GripHorizontal size={size} {...props} />;
}

