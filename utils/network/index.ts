import axios from 'axios';

const axiosClient = axios.create({
  baseURL: 'http://localhost:11434/api/generate',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default axiosClient;
