import { request } from '../utils/request'

export interface CommandStatusSnapshot {
  exists: boolean
  commandId?: string
  traceId?: string
  deviceId?: string
  deviceType?: string
  action?: string
  status?: string
  message?: string
  operator?: string
  timeoutMs?: number
  createdAt?: number
  updatedAt?: number
  terminal?: boolean
  detail?: Record<string, any>
}

class CommandStatusService {
  async getCommandStatus(commandId: string): Promise<CommandStatusSnapshot> {
    return request.get<CommandStatusSnapshot>(`/api/command-status/${commandId}`)
  }

  async getLatestCommandStatusByDevice(deviceId: string): Promise<CommandStatusSnapshot> {
    return request.get<CommandStatusSnapshot>(`/api/command-status/device/${deviceId}/latest`)
  }
}

export default new CommandStatusService()
