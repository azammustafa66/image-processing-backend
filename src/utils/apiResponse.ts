class APIResponse {
  public statusCode: number;
  public data: unknown;
  public msg: string;
  public success: boolean;

  constructor(statusCode: number, data: unknown, msg: string) {
    this.statusCode = statusCode;
    this.data = data;
    this.msg = msg;
    this.success = statusCode < 400;
  }
}

export default APIResponse;
