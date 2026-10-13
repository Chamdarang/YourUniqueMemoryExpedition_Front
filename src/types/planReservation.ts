export type PlanReservationType = 'FLIGHT' | 'ACCOMMODATION' | 'TRANSPORT' | 'TICKET' | 'RESTAURANT' | 'OTHER';
export type PlanReservationStatus = 'NEEDS_BOOKING' | 'RESERVED' | 'CANCELLED';

export interface PlanReservation {
  id: number;
  type: PlanReservationType;
  title: string;
  status: PlanReservationStatus;
  provider: string | null;
  confirmationCode: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  bookingUrl: string | null;
  address: string | null;
  memo: string | null;
  dayId: number | null;
  dayOrder: number | null;
}

export type PlanReservationSaveRequest = Omit<PlanReservation, 'id' | 'dayOrder'>;
