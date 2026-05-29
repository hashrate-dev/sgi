import { useEffect, useState } from "react";
import { getCitiesForCountry } from "../lib/registroCities";

export function useRegistroCities(countryId: string | undefined) {
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryId) {
      setCities([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getCitiesForCountry(countryId)
      .then((list) => {
        if (!cancelled) {
          setCities(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCities([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [countryId]);

  return { cities, loading };
}
