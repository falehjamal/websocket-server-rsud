import 'dotenv/config';
import { WebSocketServer } from './src/app.js';

const server = new WebSocketServer();

process.on('SIGTERM', () => {
    void server.shutdown();
});

process.on('SIGINT', () => {
    void server.shutdown();
});

void server.start();
