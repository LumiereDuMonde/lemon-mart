import { Component, OnDestroy, OnInit } from '@angular/core'
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { BehaviorSubject, Observable, merge, of } from 'rxjs'
import { filter, map, startWith, tap } from 'rxjs/operators'
import { SubSink } from 'subsink'
import { $enum } from 'ts-enum-util'

import { Role } from '../../auth/auth.enum'
import { AuthService } from '../../auth/auth.service'
import { BaseFormComponent } from '../../common/base-form.class'
import { UiService } from '../../common/ui.service'
import {
  EmailValidation,
  OptionalTextValidation,
  RequiredTextValidation,
  USAPhoneNumberValidation,
  USAZipCodeValidation,
} from '../../common/validations'
import { ErrorSets } from '../../user-controls/field-error/field-error.directive'
import { IName, IPhone, IUser, PhoneType } from '../user/user'
import { UserService } from '../user/user.service'
import { IUSState, USStateFilter } from './data'

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent extends BaseFormComponent<IUser>
  implements OnInit, OnDestroy {
  private get currentUserRole() {
    return this.authService.authStatus$.value.userRole
  }

  constructor(
    private formBuilder: FormBuilder,
    private userService: UserService,
    private authService: AuthService,
    private uiService: UiService,
    private route: ActivatedRoute
  ) {
    super()
  }

  get phonesArray(): FormArray {
    return this.formGroup.get('phones') as FormArray
  }

  get dateOfBirth() {
    return this.formGroup.get('dateOfBirth')?.value || this.now
  }

  get age() {
    return this.now.getFullYear() - this.dateOfBirth.getFullYear()
  }
  ErrorSets = ErrorSets
  Role = Role
  PhoneTypes = $enum(PhoneType).getKeys()

  now = new Date()
  minDate = new Date(
    this.now.getFullYear() - 100,
    this.now.getMonth(),
    this.now.getDate()
  )

  states$: Observable<IUSState[]> | undefined
  userError = ''
  readonly nameInitialData$ = new BehaviorSubject<IName>({
    first: '',
    middle: '',
    last: '',
  })

  private subs = new SubSink()

  currentUserId: string

  ngOnInit() {
    this.formGroup = this.buildForm()

    if (this.route.snapshot.data.user) {
      this.patchUser(this.route.snapshot.data.user)
    } else {
      // loadFromCacheForDemo is for ad-hoc cache loading, demo purposes only
      this.subs.add(
        merge(this.loadFromCacheForDemo(), this.authService.currentUser$)
          .pipe(
            filter((user) => user != null),
            tap((user) => this.patchUser(user))
          )
          .subscribe()
      )
    }
  }

  patchUser(user: IUser) {
    if (user) {
      this.currentUserId = user._id
      this.patchUpdatedData(user)
      this.nameInitialData$.next(user.name)
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe()
    this.deregisterAllForms()
  }

  buildForm(initialData?: IUser): FormGroup {
    const user = initialData
    this.currentUserId = user?._id || ''
    const form = this.formBuilder.group({
      email: [
        {
          value: user?.email || '',
          disabled: this.currentUserRole !== Role.Manager,
        },
        EmailValidation,
      ],
      name: null,
      role: [
        {
          value: user?.role || '',
          disabled: this.currentUserRole !== Role.Manager,
        },
        [Validators.required],
      ],
      level: [user?.level || 0, Validators.required],
      // use the code below to test disabled condition of <app-lemon-rater>
      // level: [{ value: 2, disabled: true }, [Validators.required]],
      dateOfBirth: [user?.dateOfBirth || '', Validators.required],
      address: this.formBuilder.group({
        line1: [user?.address?.line1 || '', RequiredTextValidation],
        line2: [user?.address?.line2 || '', OptionalTextValidation],
        city: [user?.address?.city || '', RequiredTextValidation],
        state: [user?.address?.state || '', RequiredTextValidation],
        zip: [user?.address?.zip || '', USAZipCodeValidation],
      }),
      phones: this.formBuilder.array(this.buildPhoneArray(user?.phones || [])),
    })

    this.states$ = form.get('address.state')?.valueChanges.pipe(
      startWith(''),
      map((value) => USStateFilter(value))
    )

    this.cacheChangesForDemo(form)

    return form
  }

  addPhone() {
    this.phonesArray.push(this.buildPhoneFormControl(this.phonesArray.value.length + 1))
  }

  private buildPhoneArray(phones: IPhone[]) {
    const groups = []

    if (phones?.length === 0) {
      groups.push(this.buildPhoneFormControl(1))
    } else {
      phones.forEach((p) => {
        groups.push(this.buildPhoneFormControl(p.id, p.type, p.digits))
      })
    }
    return groups
  }

  private buildPhoneFormControl(id: number, type?: string, phoneNumber?: string) {
    return this.formBuilder.group({
      id: [id],
      type: [type || '', Validators.required],
      digits: [phoneNumber || '', USAPhoneNumberValidation],
    })
  }

  async save(form: FormGroup) {
    this.subs.add(
      this.userService.updateUser(this.currentUserId, form.value).subscribe(
        (res: IUser) => {
          this.patchUser(res)
          this.uiService.showToast('Updated user')
        },
        (err: string) => (this.userError = err)
      )
    )
  }

  convertTypeToPhoneType(type: string): PhoneType {
    return PhoneType[$enum(PhoneType).asKeyOrThrow(type)]
  }

  simulateLazyLoadedInitData() {
    // for demo purposes only
    this.nameInitialData$.next({
      first: 'Peter',
      middle: 'A',
      last: 'Long',
    })
  }

  private cacheChangesForDemo(form: FormGroup) {
    // for demo purposes only
    this.subs.add(
      form.valueChanges.subscribe(() => {
        localStorage.setItem('draft-user', form.value)
        // console.log(form.value)
      })
    )
  }

  private loadFromCacheForDemo(): Observable<IUser> {
    // for demo purposes only
    let data = null

    try {
      const draftUser = localStorage.getItem('draft-user')

      if (draftUser != null) {
        data = JSON.parse(draftUser)
      }

      if (data) {
        this.uiService.showToast('Loaded data from cache')
      }
    } catch (err) {
      // no-op
    }

    return of(data)
  }
}
