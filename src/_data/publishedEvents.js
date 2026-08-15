import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync(new URL('./events.json', import.meta.url), 'utf8'));

export default eventsData.events.filter((event) => event.published === true);
