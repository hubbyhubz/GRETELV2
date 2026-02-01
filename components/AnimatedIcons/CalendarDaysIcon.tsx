import React, { forwardRef } from "react";
import { CalendarDays } from "lucide-react";

type CalendarDaysIconProps = React.ComponentProps<typeof CalendarDays> & { size?: number };

export const CalendarDaysIcon = forwardRef<any, CalendarDaysIconProps & { isHovered?: boolean }>(
  ({ size = 24, isHovered: _isHovered, ...props }, ref) => {
    return <CalendarDays ref={ref} size={size} {...props} />;
  }
);

CalendarDaysIcon.displayName = "CalendarDaysIcon";
