import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

// In dev: Vite proxy handles /api → localhost:5000
// In production (Vercel): VITE_API_URL must be set to your Render backend URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach Bearer token to every request
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let failedQueue = [];
const processQueue = (err, token) => {
  failedQueue.forEach(p => err ? p.reject(err) : p.resolve(token));
  failedQueue = [];
};

api.interceptors.response.use(
  res => res,
  async err => {
    const orig = err.config;
    // Don't retry the refresh endpoint itself
    if (orig.url === '/auth/refresh') {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(err);
    }
    if (err.response?.status === 401 && !orig._retry) {
      if (isRefreshing) {
        return new Promise((res, rej) => failedQueue.push({ resolve: res, reject: rej }))
          .then(token => { orig.headers.Authorization = 'Bearer ' + token; return api(orig); });
      }
      orig._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/auth/refresh');
        useAuthStore.getState().setAccessToken(data.accessToken);
        processQueue(null, data.accessToken);
        orig.headers.Authorization = 'Bearer ' + data.accessToken;
        return api(orig);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export const roomApi = {
  getAll:      (params) => api.get('/rooms', { params }),
  getFeatured: ()       => api.get('/rooms/featured'),
  getOne:      (id)     => api.get('/rooms/' + id),
  create:      (data)   => api.post('/rooms', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:      (id, d)  => api.put('/rooms/' + id, d),
  delete:      (id)     => api.delete('/rooms/' + id),
  getStats:    ()       => api.get('/rooms/stats'),
};

export const bookingApi = {
  checkAvailability:  (p)          => api.get('/bookings/availability', { params: p }),
  create:             (d)          => api.post('/bookings', d),
  confirm:            (d)          => api.post('/bookings/confirm', d),
  getMyBookings:      ()           => api.get('/bookings/my'),
  getById:            (id)         => api.get('/bookings/' + id),
  getAllBookings:      (p)          => api.get('/bookings', { params: p }),
  cancel:             (id, reason) => api.patch('/bookings/' + id + '/cancel', { reason }),
  resendConfirmation: (id, channel)=> api.post('/bookings/' + id + '/resend', { channel }),
  downloadTicket:     (id)         => api.get('/bookings/' + id + '/ticket', { responseType: 'blob' }),
};

export const authApi = {
  register:       (d)        => api.post('/auth/register', d),
  login:          (d)        => api.post('/auth/login', d),
  logout:         ()         => api.post('/auth/logout'),
  getMe:          ()         => api.get('/auth/me'),
  forgotPassword: (email)    => api.post('/auth/forgot-password', { email }),
  resetPassword:  (tok, pw)  => api.patch('/auth/reset-password/' + tok, { password: pw }),
  verifyEmail:    (tok)      => api.get('/auth/verify-email/' + tok),
  refresh:        ()         => api.post('/auth/refresh'),
};

export const reviewApi = {
  getAll:  (p)       => api.get('/reviews', { params: p }),
  create:  (d)       => api.post('/reviews', d),
  respond: (id, txt) => api.post('/reviews/' + id + '/respond', { text: txt }),
  delete:  (id)      => api.delete('/reviews/' + id),
};

export const adminApi = {
  getDashboard:    ()     => api.get('/admin/dashboard'),
  getRevenueChart: (year) => api.get('/admin/revenue-chart', { params: { year } }),
  getOccupancy:    (p)    => api.get('/admin/occupancy', { params: p }),
};

export const chatbotApi = {
  sendMessage: (messages, sessionId) => api.post('/chatbot/chat', { messages, sessionId }),
  recommend:   (d)                   => api.post('/chatbot/recommend', d),
};

export const galleryApi = {
  getAll:  (cat) => api.get('/gallery', { params: { category: cat } }),
  upload:  (d)   => api.post('/gallery', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete:  (id)  => api.delete('/gallery/' + id),
};

export const paymentApi = {
  createOrder: (amount, currency, notes) => api.post('/payments/create-order', { amount, currency, notes }),
  verify:      (d)                       => api.post('/payments/verify', d),
};

export const contactApi = {
  send: (d) => api.post('/contact', d),
};

export default api;
