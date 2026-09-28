// Inside Discord everything has to stay relative so it goes through their proxy
const params = new URLSearchParams(window.location.search);
export const IS_ACTIVITY = params.has('frame_id') && params.has('instance_id');

const devUrl = () => `${window.location.protocol}//${window.location.hostname}:3001`;
export const SERVER_URL = IS_ACTIVITY ? '' : process.env.REACT_APP_SERVER_URL || (process.env.NODE_ENV === 'development' ? devUrl() : '');
