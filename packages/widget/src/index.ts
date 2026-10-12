/**
 * `@characterxyz/widget` — your agent in the corner of any site, with chat and
 * voice calls.
 *
 * ```ts
 * import { mount } from '@characterxyz/widget';
 *
 * const widget = mount({
 *   publishableKey: 'cxyz_pk_live_…',
 *   accent: '#e11d48',
 *   greeting: "Hi, I'm Ananya. Ask me anything.",
 *   suggestions: ['What do you do?', 'Book a demo'],
 * });
 * widget.open('chat');
 * ```
 *
 * Or as an element: `<character-xyz publishable-key="cxyz_pk_live_…"></character-xyz>`
 * after `import '@characterxyz/widget'`. Or with no build at all:
 * `<script src="https://cdn.character.xyz/sdk/v1/cx.js" data-key="cxyz_pk_live_…" async></script>`.
 */
import { define } from './element.js';

export { CharacterXYZElement, define, inkFor, mount, TAG, type MountOptions, type WidgetHandle } from './element.js';
export { applyLayer, DEFAULTS, type ColorMode, type LauncherStyle, type Position, type WidgetConfig } from './config.js';
export { CharacterXYZ, CxError } from '@characterxyz/web';

define();
