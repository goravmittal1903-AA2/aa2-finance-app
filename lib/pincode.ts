/**
 * Utility for looking up District & State from 6-digit Indian Pincodes
 * Uses official India Post API with fallback local dictionary for instant response.
 */

interface PincodeResult {
  district: string
  state: string
  success: boolean
}

// Local fast lookup dictionary for common operational areas
const LOCAL_PINCODE_MAP: Record<string, { district: string; state: string }> = {
  '247669': { district: 'SAHARANPUR', state: 'UTTAR PRADESH' },
  '247001': { district: 'SAHARANPUR', state: 'UTTAR PRADESH' },
  '249401': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '249407': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '249408': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
  '249402': { district: 'HARIDWAR', state: 'UTTARAKHAND' },
}

export async function lookupPincode(pincode: string): Promise<PincodeResult | null> {
  const cleanPin = (pincode || '').trim()
  if (!/^\d{6}$/.test(cleanPin)) return null

  // 1. Check local fast dictionary
  if (LOCAL_PINCODE_MAP[cleanPin]) {
    return {
      district: LOCAL_PINCODE_MAP[cleanPin].district,
      state: LOCAL_PINCODE_MAP[cleanPin].state,
      success: true,
    }
  }

  // 2. Fetch from India Post API
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      cache: 'force-cache',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
      const po = data[0].PostOffice[0]
      return {
        district: (po.District || '').toUpperCase(),
        state: (po.State || '').toUpperCase(),
        success: true,
      }
    }
  } catch (err) {
    console.warn('Pincode lookup error:', err)
  }

  return null
}
