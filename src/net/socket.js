import { io } from 'socket.io-client';
import { SERVER_URL } from './config';
import { getToken } from './api';

export const socket = io(SERVER_URL || undefined, { autoConnect: false, auth: (cb) => cb({ token: getToken(), features: ['blitz'] }) });

export function request(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) reject(new Error('The server did not respond, check your connection'));
      else if (!res.ok) reject(new Error(res.error));
      else resolve(res);
    });
  });
}
