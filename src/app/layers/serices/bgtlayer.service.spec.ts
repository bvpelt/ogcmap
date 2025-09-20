import { TestBed } from '@angular/core/testing';

import { BgtlayerService } from './bgtlayer.service';

describe('BgtlayerService', () => {
  let service: BgtlayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BgtlayerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
