import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').trim()

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid 6-digit pincode' }, { status: 400 })
  }

  // 1. Primary: India Post Official API (Server-side fetch — bypasses CORS)
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${code}`, {
      cache: 'force-cache',
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
        const po = data[0].PostOffice[0]
        return NextResponse.json({
          district: (po.District || po.Block || po.Name || '').toUpperCase(),
          state: (po.State || '').toUpperCase(),
          post_office: po.Name || '',
          success: true,
        })
      }
    }
  } catch (err) {
    console.warn('Server India Post fetch error:', err)
  }

  // 2. Secondary Fallback: Zippopotam India API
  try {
    const res = await fetch(`https://api.zippopotam.us/in/${code}`, {
      cache: 'force-cache',
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.places?.length > 0) {
        const place = data.places[0]
        return NextResponse.json({
          district: (place['place name'] || '').toUpperCase(),
          state: (place['state'] || '').toUpperCase(),
          success: true,
        })
      }
    }
  } catch (err) {
    console.warn('Server Zippopotam fetch error:', err)
  }

  return NextResponse.json({ error: 'Pincode not found', success: false }, { status: 404 })
}
