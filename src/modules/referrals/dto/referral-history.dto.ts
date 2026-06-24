import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ReferralHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  referredId: string;

  @ApiPropertyOptional()
  referredEmail?: string | null;

  @ApiPropertyOptional({ example: '5.00000000' })
  rewardAmount: string | null;

  @ApiPropertyOptional({ example: 'XLM' })
  rewardCurrency: string | null;

  @ApiPropertyOptional()
  rewardedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class ReferralHistoryQueryDto extends PaginationDto {}
