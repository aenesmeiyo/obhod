import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconPower = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3v9" />
    <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
  </Icon>
)

export const IconHome = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 10.5 12 3l8.5 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.8 20v-5.4h4.4V20" />
  </Icon>
)

export const IconFlask = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 3h5" />
    <path d="M10 3v5.4L4.8 18a2.4 2.4 0 0 0 2.1 3.5h10.2a2.4 2.4 0 0 0 2.1-3.5L14 8.4V3" />
    <path d="M7.1 14.6h9.8" />
  </Icon>
)

export const IconSettings = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
  </Icon>
)

export const IconTelegram = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M21.7 4.3c-.3-.25-.76-.31-1.23-.12L2.9 11.02c-.62.25-.66.91-.08 1.2l3.93 1.94 1.5 4.7c.15.48.62.62 1.02.28l2.23-1.9 4.28 3.16c.45.33 1.02.14 1.2-.43l3.02-14.5c.1-.48-.05-.92-.3-1.17ZM8.9 13.3l9.1-5.9c.3-.2.58.16.32.4l-7.4 7.02-.34 3.3-1.68-4.82Z" />
  </svg>
)

export const IconBolt = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.2 2.5 4.7 13.2c-.3.37-.03.9.44.9H11l-.9 7.3 8.5-10.7c.3-.37.03-.9-.44-.9H12l1.2-7.3Z" />
  </Icon>
)

export const IconChevron = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const IconCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
)

export const IconX = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const IconMinus = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14" />
  </Icon>
)

export const IconDownload = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3v12" />
    <path d="m6.5 10.5 5.5 5.5 5.5-5.5" />
    <path d="M4 20h16" />
  </Icon>
)

export const IconCopy = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2.4" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
  </Icon>
)

export const IconFolder = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2.4h7A2.5 2.5 0 0 1 21 9.9v7.6a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
  </Icon>
)

export const IconRefresh = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 0 0-14.9-3.9L4 9" />
    <path d="M4 4v5h5" />
    <path d="M4 13a8 8 0 0 0 14.9 3.9L20 15" />
    <path d="M20 20v-5h-5" />
  </Icon>
)

export const IconTrash = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7" />
    <path d="m6 7 1 12.2A1.9 1.9 0 0 0 8.9 21h6.2a1.9 1.9 0 0 0 1.9-1.8L18 7" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
)

export const IconShield = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 5 6v6c0 4.4 3 7.5 7 9 4-1.5 7-4.6 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
)

export const IconActivity = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12h4l2.5-7 4 14L16 12h5" />
  </Icon>
)

export const IconClock = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.4l3.2 2" />
  </Icon>
)

export const IconArrowUpRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </Icon>
)

export const IconSparkles = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5c.4 3.4 2.1 5.1 5.5 5.5-3.4.4-5.1 2.1-5.5 5.5-.4-3.4-2.1-5.1-5.5-5.5 3.4-.4 5.1-2.1 5.5-5.5Z" />
    <path d="M18.5 14.5c.2 1.7 1 2.5 2.7 2.7-1.7.2-2.5 1-2.7 2.7-.2-1.7-1-2.5-2.7-2.7 1.7-.2 2.5-1 2.7-2.7Z" />
    <path d="M5.5 15.5c.15 1.2.75 1.8 1.95 1.95-1.2.15-1.8.75-1.95 1.95-.15-1.2-.75-1.8-1.95-1.95 1.2-.15 1.8-.75 1.95-1.95Z" />
  </Icon>
)

export const IconWarning = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5" />
    <path d="M12 17h.01" />
  </Icon>
)

export const IconInfo = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <path d="M12 7.5h.01" />
  </Icon>
)

export const IconTerminal = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="m7 9 3 3-3 3" />
    <path d="M13 15h4" />
  </Icon>
)

export const IconSearch = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4 4" />
  </Icon>
)

export const IconGauge = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 18a9 9 0 1 1 16 0" />
    <path d="M12 14 15.5 9" />
    <circle cx="12" cy="15" r="1.6" />
  </Icon>
)

export const IconCrown = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8.5 7 11l5-6 5 6 4-2.5-1.6 9.5H4.6L3 8.5Z" />
    <path d="M7 20h10" />
  </Icon>
)

export const IconWifi = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 9.5a14 14 0 0 1 18 0" />
    <path d="M6.5 13a9 9 0 0 1 11 0" />
    <path d="M9.7 16.4a4.4 4.4 0 0 1 4.6 0" />
    <path d="M12 20h.01" />
  </Icon>
)
