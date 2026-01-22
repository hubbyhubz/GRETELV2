import React from "react";
import { CalendarDays } from "lucide-react";

type CalendarDaysIconProps = React.ComponentProps<typeof CalendarDays> & { size?: number };

export function CalendarDaysIcon({ size = 24, isHovered: _isHovered, ...props }: CalendarDaysIconProps & { isHovered?: boolean }) {
  return <CalendarDays size={size} {...props} />;
}
