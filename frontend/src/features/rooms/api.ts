import { apiClient } from '../../shared/api/client'
import type { Room, RoomInput, Seat } from './types'

export async function getRooms(): Promise<Room[]> {
  return (await apiClient.get<Room[]>('/rooms')).data
}

export async function createRoom(payload: RoomInput): Promise<Room> {
  return (await apiClient.post<Room>('/rooms', payload)).data
}

export async function updateRoom(id: string, payload: Partial<RoomInput>): Promise<Room> {
  return (await apiClient.patch<Room>(`/rooms/${id}`, payload)).data
}

export async function getSeats(roomId: string): Promise<Seat[]> {
  return (await apiClient.get<Seat[]>(`/rooms/${roomId}/seats`)).data
}

export async function saveSeats(roomId: string, seats: Seat[]): Promise<Seat[]> {
  return (await apiClient.put<Seat[]>(`/rooms/${roomId}/seats`, { seats })).data
}
