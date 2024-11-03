import { EventEmitter } from 'events';
export const eventBus = new EventEmitter();

export enum Events {
  AMQP_READY = 'amqp:ready'
}
