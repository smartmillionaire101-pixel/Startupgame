import { useEffect, useState } from 'react';
import { citySun } from './solar';
export function useDaylight(city: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return citySun(city, now);
}
