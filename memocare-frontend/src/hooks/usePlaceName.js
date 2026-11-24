import { useQuery } from '@tanstack/react-query';
import { storeService } from '../api';

/**
 * Turns latitude/longitude into a readable "place, city, state" label.
 * Returns '' while the lookup is still running or when there are no coords.
 */
export function usePlaceName(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const enabled = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  const { data } = useQuery({
    queryKey: ['place-name', lat, lng],
    queryFn: () => storeService.locationName({ latitude: lat, longitude: lng }),
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return data?.label || '';
}
