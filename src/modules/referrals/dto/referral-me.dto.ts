import { ApiProperty } from '@nestjs/swagger';

export class ReferralMeResponseDto {
  @ApiProperty({ example: 'AB12CD34' })
  referralCode: string;

  @ApiProperty({ example: 5 })
  totalReferrals: number;

  @ApiProperty({ example: '25.00000000' })
  totalRewardsEarned: string;

  @ApiProperty({ example: 'XLM' })
  rewardCurrency: string;
}
