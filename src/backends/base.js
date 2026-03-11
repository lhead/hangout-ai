/**
 * Backend base class — defines the interface all backends must implement.
 */
export class Backend {
  constructor(name, config) {
    this.name = name;
    this.config = config;
  }

  getToken() {
    throw new Error(`${this.constructor.name}.getToken() not implemented`);
  }

  async publish({ summary, body }) {
    throw new Error(`${this.constructor.name}.publish() not implemented`);
  }

  async feed({ days, limit }) {
    throw new Error(`${this.constructor.name}.feed() not implemented`);
  }

  async search(query) {
    throw new Error(`${this.constructor.name}.search() not implemented`);
  }

  async reply({ number, text }) {
    throw new Error(`${this.constructor.name}.reply() not implemented`);
  }

  async replies(number) {
    throw new Error(`${this.constructor.name}.replies() not implemented`);
  }
}
