/**
 * All-India Pincode Auto-Fetch Engine
 * Supports all 19,000+ pincodes across all 28 States and 8 Union Territories in India.
 * Dual-API strategy (India Post API + Zippopotam API) with in-memory caching.
 */

interface PincodeResult {
  district: string
  state: string
  success: boolean
}

// In-memory cache for instant repeat lookups across all 19,000+ pincodes in India
const pincodeCache = new Map<string, PincodeResult>()

// Fast lookup dictionary for local operational hubs (0ms response)
const FAST_PINCODE_MAP: Record<string, { district: string; state: string }> = {
  '247669': { district: 'SAHARANPUR', state: 'UTTAR PRADESH' },
  '247001': { district: 'SAHARANPUR', state: 'UTTAR PRADESH' },
  '249401': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '249407': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '249408': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '249402': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '110001': { district: 'NEW DELHI', state: 'DELHI' },
  '400001': { district: 'MUMBAI', state: 'MAHARASHTRA' },
  '700001': { district: 'KOLKATA', state: 'WEST BENGAL' },
  '600001': { district: 'CHENNAI', state: 'TAMIL NADU' },
  '560001': { district: 'BENGALURU', state: 'KARNATAKA' },
  '500001': { district: 'HYDERABAD', state: 'TELANGANA' },
}

export async function lookupPincode(pincode: string): Promise<PincodeResult | null> {
  const cleanPin = (pincode || '').trim()
  if (!/^\d{6}$/.test(cleanPin)) return null

  // 1. Check in-memory cache
  if (pincodeCache.has(cleanPin)) {
    return pincodeCache.get(cleanPin)!
  }

  // 2. Check local fast dictionary
  if (FAST_PINCODE_MAP[cleanPin]) {
    const res: PincodeResult = {
      district: FAST_PINCODE_MAP[cleanPin].district,
      state: FAST_PINCODE_MAP[cleanPin].state,
      success: true,
    }
    pincodeCache.set(cleanPin, res)
    return res
  }

  // 3. Primary: India Post Official API (All India coverage)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      cache: 'force-cache',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
        const po = data[0].PostOffice[0]
        const result: PincodeResult = {
          district: (po.District || po.Block || po.Name || '').toUpperCase(),
          state: (po.State || '').toUpperCase(),
          success: true,
        }
        pincodeCache.set(cleanPin, result)
        return result
      }
    }
  } catch (err) {
    // Primary API timed out or error — try secondary fallback
  }

  // 4. Secondary Fallback: Zippopotam India API
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`https://api.zippopotam.us/in/${cleanPin}`, {
      cache: 'force-cache',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      if (data?.places?.length > 0) {
        const place = data.places[0]
        const result: PincodeResult = {
          district: (place['place name'] || place['state abbreviation'] || '').toUpperCase(),
          state: (place['state'] || '').toUpperCase(),
          success: true,
        }
        pincodeCache.set(cleanPin, result)
        return result
      }
    }
  } catch (err) {
    console.warn('All-India Pincode lookup fallback error:', err)
  }

  return null
}
