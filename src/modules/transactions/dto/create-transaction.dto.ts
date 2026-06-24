import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { V2TransactionType } from '../entities/transaction.entity';

export class CreateV2TransactionDto {
  @ApiProperty({ enum: V2TransactionType })
  @IsEnum(V2TransactionType)
  type: V2TransactionType;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3,10}$/)
  fromCurrency: string;

  @ApiPropertyOptional({ example: '100.00000000' })
  @IsOptional()
  @IsString()
  toAmount?: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3,10}$/)
  toCurrency: string;

  @ApiProperty({ example: 'unique-client-key-123' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
