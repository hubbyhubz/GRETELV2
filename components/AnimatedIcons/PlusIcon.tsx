import React from "react";
import { Plus } from "lucide-react";

type PlusIconProps = Omit<React.ComponentProps<typeof Plus>, "size"> & {
  size?: number;
  title?: string;
};

export function PlusIcon({ size = 24, title, ...props }: PlusIconProps) {
  return (
    <Plus size={size} {...(props as any)}>
      {title ? <title>{title}</title> : null}
    </Plus>
  );
}
