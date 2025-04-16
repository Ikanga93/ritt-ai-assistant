import { EntityTarget, Repository, FindOptionsWhere, ObjectLiteral } from "typeorm";
import { AppDataSource } from "../database.js";

export abstract class BaseRepository<T extends ObjectLiteral> {
  protected repository: Repository<T>;

  constructor(entity: EntityTarget<T>) {
    this.repository = AppDataSource.getRepository(entity);
  }

  async findOne(id: string | number): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
    });
  }

  async save(entity: T): Promise<T> {
    return this.repository.save(entity);
  }

  async delete(id: string | number): Promise<void> {
    await this.repository.delete(id);
  }
} 