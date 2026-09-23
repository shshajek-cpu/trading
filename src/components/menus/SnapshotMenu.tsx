import { MenuItem, Popover } from '../ui/Popover'
import { Icon } from '../Icon'

interface SnapshotMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  onDownload: () => void
  onCopy: () => void
}

export function SnapshotMenu({ anchor, open, onClose, onDownload, onCopy }: SnapshotMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-end">
      <MenuItem
        icon={<Icon name="download" size={20} />}
        label="이미지 다운로드"
        onSelect={() => {
          onDownload()
          onClose()
        }}
      />
      <MenuItem
        icon={<Icon name="clipboard" size={20} />}
        label="클립보드에 복사"
        onSelect={() => {
          onCopy()
          onClose()
        }}
      />
    </Popover>
  )
}
