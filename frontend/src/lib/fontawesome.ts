import { config } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';

// We render icons ourselves via <FontAwesomeIcon>, so let Next.js handle CSS
// through globals.css instead of FontAwesome's own runtime style injection.
config.autoAddCss = false;
