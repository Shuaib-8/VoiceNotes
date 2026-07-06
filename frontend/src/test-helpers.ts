import { vi } from 'vitest'

export interface FetchCall {
  url: string
  method: string
  body: FormData | null
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Error

/** Stub global fetch; the handler returns a Response (or an Error to reject the promise). */
export function stubFetch(handler: FetchHandler): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body instanceof FormData ? init.body : null,
      })
      const result = handler(url, init)
      if (result instanceof Error) throw result
      return result
    }),
  )
  return { calls }
}

export function stubClipboard(): { writes: string[] } {
  const writes: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string): Promise<void> => {
        writes.push(text)
      },
    },
  })
  return { writes }
}

export function grantMicrophone(): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(
        async (): Promise<MediaStream> =>
          ({ getTracks: (): { stop: () => void }[] => [{ stop: vi.fn() }] }) as unknown as MediaStream,
      ),
    },
  })
}

export function denyMicrophone(errorName: string): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (): Promise<MediaStream> => {
        throw new DOMException('nope', errorName)
      }),
    },
  })
}

export class MockMediaRecorder {
  static supported: string[] = ['audio/webm;codecs=opus', 'audio/webm']
  static instances: MockMediaRecorder[] = []

  static isTypeSupported(type: string): boolean {
    return MockMediaRecorder.supported.includes(type)
  }

  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm'
    MockMediaRecorder.instances.push(this)
  }

  start(_timesliceMs?: number): void {
    this.state = 'recording'
  }

  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

export function installMockRecorder(): void {
  MockMediaRecorder.instances = []
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
}
