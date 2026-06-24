import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  V2TransactionStatus,
  V2TransactionType,
} from '../entities/transaction.entity';

export class V2TransactionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: V2TransactionStatus })
  @IsOptional()
  @IsEnum(V2TransactionStatus)
  status?: V2TransactionStatus;

  @ApiPropertyOptional({ enum: V2TransactionType })
  @IsOptional()
  @IsEnum(V2TransactionType)
  type?: V2TransactionType;

  @ApiPropertyOptional({ description: 'ISO date filter (createdAt >= from)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date filter (createdAt <= to)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
