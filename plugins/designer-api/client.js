// Client-Hooks des Plugins "designer-api": nur das Einstellungs-Panel „Designer verbinden“ (landet im Browser-Bundle:
// nichts mit Secrets, Prisma oder fs). Server-Seite: server.js.
import DesignerPanel from './components/DesignerPanel';

export default { SettingsPanel: DesignerPanel };
