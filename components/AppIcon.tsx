import React from 'react';
import { motion } from 'framer-motion';

const ICONS = {
  home: '/icons/home.svg',
  analytics: '/icons/report.svg',
  play: '/icons/play-circle.svg',
  report: '/icons/report.svg',
  chat: '/icons/chat-circle-dots.svg',
  calendar: '/icons/calendar.svg',
  briefcase: '/icons/briefcase.svg',
  menu: '/icons/menu.svg',
  close: '/icons/close.svg',
  command: '/icons/command.svg',
  gift: '/icons/gift.svg',
  feedback: '/icons/feedback.svg',
  settings: '/icons/settings.svg',
  logout: '/icons/logout.svg',
  send: '/icons/send.svg',
  mic: '/icons/microphone.svg',
  attach: '/icons/attach.svg',
  stop: '/icons/stop.svg',
  user: '/icons/user.svg',
  users: '/icons/users.svg',
  security: '/icons/security.svg',
  upload: '/icons/upload.svg',
  eye: '/icons/eye.svg',
  eyeOff: '/icons/eye-closed.svg',
  mail: '/icons/mail.svg',
  lock: '/icons/lock.svg',
  phone: '/icons/phone.svg',
  authenticator: '/icons/authenticator.svg',
  trash: '/icons/trash.svg',
  check: '/icons/check-square.svg',
  sun: '/icons/sun.svg',
  moon: '/icons/moon.svg',
  reminder: '/icons/reminder.svg',
  briefing: '/icons/briefing.svg',
  coaching: '/icons/coaching.svg',
  log: '/icons/log.svg',
  communication: '/icons/communication.svg',
  template: '/icons/template.svg',
  project: '/icons/project.svg',
  bulldozer: '/icons/bulldozer.svg',
  warning: '/icons/warning.svg',
  strategy: '/icons/strategy.svg',
  alarm: '/icons/alarm.svg',
  alert: '/icons/alert-circle.svg',
  copy: '/icons/copy.svg',
  download: '/icons/download.svg',
} as const;

export type AppIconName = keyof typeof ICONS;

interface AppIconProps {
  name: AppIconName;
  className?: string;
  alt?: string;
  isHovered?: boolean;
}

const ICON_VERSION = `v3-${Date.now().toString(36)}`;

const AppIcon: React.FC<AppIconProps> = ({ name, className = '', alt = '', isHovered }) => (
  <motion.img
    src={`${ICONS[name]}?v=${ICON_VERSION}`}
    className={className}
    alt={alt}
    aria-hidden={alt ? undefined : true}
    style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
    animate={isHovered ? "hover" : "normal"}
    whileTap="tap"
    variants={{
      normal: { scale: 1, filter: "brightness(1)" },
      hover: { 
        scale: 1.05, 
        filter: "brightness(1.1)", // Subtle color transition effect
        transition: { duration: 0.3, ease: "easeInOut" }
      },
      tap: { scale: 0.95 } // Bounce effect
    }}
  />
);

export default AppIcon;
