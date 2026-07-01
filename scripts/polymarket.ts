const PAGE_SIZE = 100

export async function fetchGammaEvents<T>(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const merged: T[] = []

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(baseUrl)
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(offset))

    const res = await fetcher(url.toString())
    if (!res.ok) throw new Error(`gamma ${res.status}`)

    const page = (await res.json()) as T[]
    merged.push(...page)
    if (page.length < pageSize) return merged
  }
}
