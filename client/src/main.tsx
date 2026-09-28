import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// 生产环境注册 Service Worker（PWA 离线/可安装）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW 注册失败不影响使用 */
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
