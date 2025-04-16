import { Customer } from "../entities/Customer.js";
import { BaseRepository } from "./BaseRepository.js";
import { FindOptionsWhere } from "typeorm";

export class CustomerRepository extends BaseRepository<Customer> {
  constructor() {
    super(Customer);
  }

  async findByPhoneNumber(phoneNumber: string): Promise<Customer | null> {
    return this.repository.findOne({
      where: { phoneNumber } as FindOptionsWhere<Customer>,
    });
  }

  async findOrCreateByPhoneNumber(phoneNumber: string, data: Partial<Customer> = {}): Promise<Customer> {
    let customer = await this.findByPhoneNumber(phoneNumber);
    
    if (!customer) {
      customer = await this.create({
        ...data,
        phoneNumber,
      });
    }
    
    return customer;
  }
} 