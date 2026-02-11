import { createClient } from 'redis';

const redisClient = createClient({
    url: 'redis://localhost:6379' 
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));
// (async () => {
//     if (!redisClient.isOpen) await redisClient.connect();
// })();


redisClient.connect().catch(console.error);
export default redisClient;