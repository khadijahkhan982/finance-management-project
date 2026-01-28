import { createClient } from 'redis';

const redisClient = createClient({
    url: 'redis://localhost:6379' 
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    if (!redisClient.isOpen) await redisClient.connect();
})();

export default redisClient;