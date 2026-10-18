import { avatarUrl } from './core.js';
export function renderAvatar(user) {
  const wrapper = document.createElement('span'); wrapper.className = 'avatar';
  wrapper.textContent = (user.name || user.handle).slice(0, 1).toUpperCase();
  const url = avatarUrl(user.avatarUrl);
  if (url) {
    const image = document.createElement('img'); image.alt = `${user.name || user.handle} 的头像`;
    image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.onerror = () => image.remove(); image.src = url; wrapper.append(image);
  }
  return wrapper;
}
