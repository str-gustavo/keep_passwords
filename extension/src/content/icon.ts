import { isVisible } from '@/shared/forms';
import { lockIcon } from './brand';
import { createOverlay, ensureAttached, h, isUserEvent, overlayVisible, setHostStyles } from './host';
import { T } from './strings';
import { ICON_CSS } from './styles';

export const ICON_SIZE = 20;
/** The icon's left edge sits this far inside the field's right edge. */
export const ICON_INSET = 26;
/** Narrower fields (PIN boxes) get no icon: it would cover what is typed. */
const MIN_FIELD_WIDTH = 48;

/** The Nexus lock over the right edge of one password field. */
export class FieldIcon {
  readonly host: HTMLElement;

  constructor(readonly field: HTMLInputElement, onActivate: (field: HTMLInputElement) => void) {
    const doc = field.ownerDocument;
    const { host, root } = createOverlay(doc, 'nexus-passwords-icon', ICON_CSS);
    this.host = host;
    // tabindex -1: the host sits at the end of <html>, so a tab stop there would be far from its field.
    const button = h(doc, 'button', {
      class: 'icon',
      attrs: { type: 'button', tabindex: '-1', title: T.appName, 'aria-label': T.iconLabel, 'aria-haspopup': 'menu' },
    }, [lockIcon(doc, ICON_SIZE)]);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      if (isUserEvent(e) && overlayVisible(host)) onActivate(field);
    });
    root.append(button);
    this.position();
  }

  /** Absolute document coordinates: `right - 26px`, vertically centred; hidden while the field is not visible. */
  position(): void {
    const { field, host } = this;
    const win = field.ownerDocument.defaultView;
    if (!win || !field.isConnected || !isVisible(field)) {
      host.hidden = true;
      return;
    }
    const r = field.getBoundingClientRect();
    if (r.width > 0 && r.width < MIN_FIELD_WIDTH) {
      host.hidden = true;
      return;
    }
    ensureAttached(field.ownerDocument, host);
    host.hidden = false;
    setHostStyles(host, {
      top: `${r.top + win.scrollY + (r.height - ICON_SIZE) / 2}px`,
      left: `${r.right + win.scrollX - ICON_INSET}px`,
    });
  }

  destroy(): void {
    this.host.remove();
  }
}
