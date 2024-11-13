interface MockMessageDataOptions {
  appPid?: string;
}

export function getMockMessageData({ appPid }: MockMessageDataOptions = {}): any {
  return {
    appPid
  };
}
