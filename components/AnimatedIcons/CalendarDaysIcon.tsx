import React from "react";
import { CalendarDays } from "lucide-react";

type CalendarDaysIconProps = React.ComponentProps<typeof CalendarDays> & { size?: number };

export function CalendarDaysIcon({ size = 24, ...props }: CalendarDaysIconProps) {
  return <CalendarDays size={size} {...props} />;
}

