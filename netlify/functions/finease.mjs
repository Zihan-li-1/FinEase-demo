import { handleBanking } from '../../server/banking.mjs';
const finease = request => handleBanking(request);
export default finease;
export const config = { path: '/api/finease', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
